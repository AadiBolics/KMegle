const crypto = require("crypto");
const Node = require("./Node");
const dbService = require("../services/dbService");
const roomService = require("../services/roomService");

class MatchmakerQueue {
  constructor() {
    this.head = null;
    this.tail = null;
    this.size = 0;
    this.nodesMap = new Map();
    this.isMatching = false;
    // Set when add() is called mid-pass so users who joined while a pass was
    // awaiting the DB are not left waiting for some unrelated future trigger.
    this.rematchRequested = false;
    this.retryTimer = null;
  }

  add(socket, userId) {
    if (!this._push(socket, userId)) {
      return;
    }

    this.tryMatch();
  }

  // Appends to the tail without triggering a match pass. Returns false if the
  // socket is already queued or has already disconnected.
  _push(socket, userId) {
    if (this.nodesMap.has(socket.id) || socket.connected === false) {
      return false;
    }

    const newNode = new Node(socket, userId);

    this.nodesMap.set(socket.id, newNode);

    if (!this.head) {
      this.head = this.tail = newNode;
    } else {
      this.tail.next = newNode;
      newNode.prev = this.tail;
      this.tail = newNode;
    }

    this.size++;

    return true;
  }

  remove(socketId) {
    const node = this.nodesMap.get(socketId);

    if (!node) {
      return;
    }

    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    this.nodesMap.delete(socketId);
    this.size--;
  }

  rotateHeadToTail() {
    if (this.size < 2 || !this.head) {
      return;
    }

    const oldHead = this.head;

    this.remove(oldHead.socket.id);
    this._push(oldHead.socket, oldHead.userId);
  }

  async tryMatch() {
    if (this.isMatching) {
      this.rematchRequested = true;
      return;
    }

    this.isMatching = true;
    let needsRetry = false;

    try {
      // Drop sockets that disconnected before their disconnect handler ran,
      // so they can never be matched into a dead room.
      for (let node = this.head; node; ) {
        const next = node.next;
        if (node.socket.connected === false) {
          this.remove(node.socket.id);
        }
        node = next;
      }

      // Fetch ALL block relationships for the currently-queued users in ONE
      // round-trip, instead of one round-trip per queued user. At real DB
      // latency (~30-40ms observed against Neon), N sequential round-trips
      // under this method's single-flight lock was itself the concurrency
      // ceiling once queue size grew into the hundreds — a full pass for
      // n=300 took ~10s of DB latency alone before any JS work. Collapsing
      // to one query makes pass time ~constant regardless of queue size.
      const queuedUserIds = [];
      for (let node = this.head; node; node = node.next) {
        queuedUserIds.push(node.userId);
      }

      // null is the fail-closed sentinel: if we can't verify block status
      // for this pass, treat every pair as blocked rather than guess "not
      // blocked" on a DB failure.
      let blockGraph = null;
      try {
        blockGraph = await dbService.getBlockGraphForUsers(queuedUserIds);
      } catch (err) {
        console.error("❌ Error fetching block graph:", err);
      }

      if (!blockGraph) needsRetry = true;

      const isBlockedPair = (idA, idB) => {
        if (!blockGraph) return true;
        // Never pair a user with themselves (same account in two tabs).
        if (idA === idB) return true;
        // Users who joined after the graph was fetched have unknown block
        // status; skip them this pass (rematchRequested picks them up next).
        if (!blockGraph.has(idA) || !blockGraph.has(idB)) return true;
        return (
          blockGraph.get(idA)?.has(idB) === true ||
          blockGraph.get(idB)?.has(idA) === true
        );
      };

      let attempts = 0;

      while (this.size >= 2 && attempts < this.size) {
        const user1 = this.head;

        if (!user1) {
          break;
        }

        let user2 = user1.next;
        let foundMatch = false;

        while (user2) {
          const hasBlocked = isBlockedPair(user1.userId, user2.userId);

          // KMEGLE-SEC-010: Ensure neither user disconnected or was matched during async DB lookup
          if (!this.nodesMap.has(user1.socket.id) || !this.nodesMap.has(user2.socket.id)) {
            break;
          }

          if (!hasBlocked) {
            foundMatch = true;
            break;
          }

          console.log(
            ` Skipped match due to block rules between ${user1.userId} and ${user2.userId}`
          );

          user2 = user2.next;
        }

        if (!foundMatch || !user2 || !this.nodesMap.has(user1.socket.id) || !this.nodesMap.has(user2.socket.id)) {
          this.rotateHeadToTail();
          attempts++;
          continue;
        }

        attempts = 0;

        this.remove(user1.socket.id);
        this.remove(user2.socket.id);

        // KMEGLE-SEC-023: Use unguessable cryptographically secure UUIDs instead of predictable socket IDs
        const roomId = crypto.randomUUID();
        // KMEGLE-SEC-014: Session nonce to prevent cross-session WebRTC race conditions
        const sessionNonce = crypto.randomUUID();

        roomService.createRoom(
          roomId,
          user1,
          user2
        );

        const roomObj = roomService.getRoom(roomId);
        if (roomObj) {
          roomObj.sessionNonce = sessionNonce;
        }

        // Remove stale rooms
        [user1.socket, user2.socket].forEach((socket) => {
          socket.rooms.forEach((room) => {
            if (room !== socket.id) {
              socket.leave(room);
            }
          });

          socket.join(roomId);
        });

        user1.socket.emit("match_found", {
          role: "initiator",
          roomId,
          sessionNonce,
        });

        user2.socket.emit("match_found", {
          role: "responder",
          roomId,
          sessionNonce,
        });

        console.log(
          ` Match created [Room ${roomId}]: ${user1.userId} and ${user2.userId}`
        );
      }
    } finally {
      this.isMatching = false;

      if (this.rematchRequested) {
        this.rematchRequested = false;
        setImmediate(() => this.tryMatch());
      } else if (needsRetry && this.size >= 2 && !this.retryTimer) {
        // The block lookup failed (fail-closed), so nobody was matched. Retry
        // shortly instead of leaving everyone stuck on "searching".
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.tryMatch();
        }, 2000);
        this.retryTimer.unref?.();
      }
    }
  }
}

module.exports = MatchmakerQueue;