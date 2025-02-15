import "dotenv/config";
import * as sdk from "matrix-js-sdk";
import { RoomEvent, ClientEvent } from "matrix-js-sdk";
import { handleMessage, handleRoomHistory } from "./messages";
import handleReaction from "./reactions";
const { homeserver, access_token, userId, whatsAppRoomId } = process.env;

const client = sdk.createClient({
  baseUrl: homeserver,
  accessToken: access_token,
  userId,
});

const start = async () => {
  await client.startClient();

  client.once(ClientEvent.Sync, async (state, prevState, res) => {
    // state will be 'PREPARED' when the client is ready to use
    console.log(state);
  });

  const scriptStart = Date.now();
  let roomText = "";

  client.on(
    RoomEvent.Timeline,
    async function (event, room, toStartOfTimeline) {
      const eventTime = event.event.origin_server_ts;

      if (event.event.room_id !== whatsAppRoomId) {
        return; // don't activate unless in the active room
      }

      // collect all messages in the room
      if (scriptStart > eventTime) {
        if (event.getType() === "m.room.message") {
          roomText += `${event.event.sender}: ${event.event.content.body}\n`;
        }
        return; //don't run commands for old messages
      } else {
        if (roomText.length > 0) {
          handleRoomHistory(roomText);
          roomText = "";
        }
      }

      // if (event.event.sender === userId) {
      //   return; // don't reply to messages sent by the tool
      // }

      if (
        event.getType() !== "m.room.message" &&
        event.getType() !== "m.reaction"
      ) {
        console.log("skipping event:", event);
        return; // only use messages or reactions
      }

      if (event.getType() === "m.room.message") handleMessage(event);

      if (event.getType() === "m.reaction") handleReaction(event);
    }
  );
};

start();

