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
  }

  add(socket, userId) {
    if (this.nodesMap.has(socket.id)) {
      return;
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

    this.tryMatch();
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
    this.add(oldHead.socket, oldHead.userId);
  }

  async tryMatch() {
    if (this.isMatching) {
      return;
    }

    this.isMatching = true;

    try {
      let attempts = 0;

      while (this.size >= 2 && attempts < this.size) {
        const user1 = this.head;

        if (!user1) {
          break;
        }

        let user2 = user1.next;
        let foundMatch = false;

        while (user2) {
          let hasBlocked = false;

          try {
            hasBlocked = await dbService.hasBlocked(
              user1.userId,
              user2.userId
            );
          } catch (err) {
            console.error(
              "❌ Error checking block status:",
              err
            );
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

        if (!foundMatch || !user2) {
          this.rotateHeadToTail();
          attempts++;
          continue;
        }

        attempts = 0;

        this.remove(user1.socket.id);
        this.remove(user2.socket.id);

        const roomId = `room_${user1.socket.id}_${user2.socket.id}`;

        roomService.createRoom(
          roomId,
          user1,
          user2
        );

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
        });

        user2.socket.emit("match_found", {
          role: "responder",
          roomId,
        });

        console.log(
          ` Match created: ${user1.userId} and ${user2.userId}`
        );
      }
    } finally {
      this.isMatching = false;
    }
  }
}

module.exports = MatchmakerQueue;