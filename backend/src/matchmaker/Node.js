class Node {
  constructor(socket, userId) {
    this.socket = socket;
    this.userId = userId;
    this.prev = null;
    this.next = null;
  }
}

module.exports = Node;