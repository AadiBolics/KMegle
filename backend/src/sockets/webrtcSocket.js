function registerWebRTCSocket(socket, roomService) {

  console.log(
    "🔌 WebRTC socket handlers registered for:",
    socket.id
  );


  socket.on(
    "webrtc_offer",
    ({ offer, roomId }) => {
      console.log(
        "📡 WEBRTC OFFER RECEIVED",
        {
          socketId: socket.id,
          roomId,
        }
      );

      if (!offer || !roomId) {
        console.warn(
          "⚠️ Invalid WebRTC offer payload"
        );
        return;
      }

      const isMember =
        roomService.isMember(
          roomId,
          socket.id
        );

      console.log(
        "🔎 Offer room membership:",
        {
          socketId: socket.id,
          roomId,
          isMember,
        }
      );

      if (!isMember) {
        console.warn(
          "🚫 Socket is not a member of room:",
          socket.id,
          roomId
        );
        return;
      }

      const room =
        roomService.getRoom(roomId);

      console.log(
        "🏠 Forwarding WebRTC offer",
        {
          from: socket.id,
          roomId,
          room,
        }
      );

      socket
        .to(roomId)
        .emit("webrtc_offer", {
          offer,
        });

      console.log(
        "✅ WebRTC offer forwarded"
      );
    }
  );

  socket.on(
    "webrtc_answer",
    ({ answer, roomId }) => {
      console.log(
        "📡 WEBRTC ANSWER RECEIVED",
        {
          socketId: socket.id,
          roomId,
        }
      );

      if (!answer || !roomId) {
        console.warn(
          "⚠️ Invalid WebRTC answer payload"
        );
        return;
      }

      const isMember =
        roomService.isMember(
          roomId,
          socket.id
        );

      console.log(
        "🔎 Answer room membership:",
        {
          socketId: socket.id,
          roomId,
          isMember,
        }
      );

      if (!isMember) {
        console.warn(
          "🚫 Socket is not a member of room:",
          socket.id,
          roomId
        );
        return;
      }

      socket
        .to(roomId)
        .emit("webrtc_answer", {
          answer,
        });

      console.log(
        "✅ WebRTC answer forwarded"
      );
    }
  );

  socket.on(
    "webrtc_ice_candidate",
    ({ candidate, roomId }) => {
      console.log(
        "🧊 WEBRTC ICE CANDIDATE RECEIVED",
        {
          socketId: socket.id,
          roomId,
        }
      );

      if (!candidate || !roomId) {
        return;
      }

      const isMember =
        roomService.isMember(
          roomId,
          socket.id
        );

      if (!isMember) {
        console.warn(
          "🚫 ICE sender is not room member:",
          socket.id,
          roomId
        );
        return;
      }

      socket
        .to(roomId)
        .emit(
          "webrtc_ice_candidate",
          {
            candidate,
          }
        );
    }
  );
}

module.exports = registerWebRTCSocket;