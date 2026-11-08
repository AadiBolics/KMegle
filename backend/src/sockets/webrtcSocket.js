const { validSession, envelope } = require("../services/sessionProtocol");
module.exports = function registerWebRTCSocket(socket, rooms) {
  for (const [event, field, type] of [
    ["webrtc_offer", "offer", "offer"],
    ["webrtc_answer", "answer", "answer"],
    ["webrtc_ice_candidate", "candidate", null],
    ["webrtc_restart_request", null, null],
  ]) {
    socket.on(event, (packet, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const room = validSession(rooms, socket, packet);
      if (
        !room ||
        !Number.isSafeInteger(packet.negotiationId) ||
        packet.negotiationId < 0
      )
        return reply({ ok: false });
      if (event === "webrtc_offer") {
        if (
          room.u1.socketId !== socket.id ||
          packet.negotiationId <= (room.negotiationId ?? -1) ||
          packet.negotiationId > (room.negotiationId ?? -1) + 1
        )
          return reply({ ok: false });
      } else if (packet.negotiationId !== (room.negotiationId || 0))
        return reply({ ok: false });
      if (event === "webrtc_answer" && room.u2.socketId !== socket.id)
        return reply({ ok: false });
      if (field) {
        const value = packet[field];
        if (!value || typeof value !== "object") return reply({ ok: false });
        if (
          type &&
          (value.type !== type ||
            typeof value.sdp !== "string" ||
            value.sdp.length > 60000)
        )
          return reply({ ok: false });
        if (
          !type &&
          (typeof value.candidate !== "string" || value.candidate.length > 4096)
        )
          return reply({ ok: false });
      }
      if (event === "webrtc_offer") room.negotiationId = packet.negotiationId;
      socket
        .to(packet.roomId)
        .emit(event, {
          ...envelope(packet.roomId, room),
          negotiationId: packet.negotiationId,
          ...(field ? { [field]: packet[field] } : {}),
        });
      reply({ ok: true });
    });
  }
};
