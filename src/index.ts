import "dotenv/config";
import * as sdk from "matrix-js-sdk";
import { RoomEvent, ClientEvent, MatrixEvent } from "matrix-js-sdk";
import { handleMessage, handleRoomHistory } from "./messages";
import handleReaction from "./reactions";
import { getRoomEvents } from "./matrixClientRequests";
const { homeserver, access_token, userId, whatsAppRoomId, HANDLE_ROOM_RECENT_HISTORY, HANDLE_ROOM_PAST_HISTORY, HANDLE_FAKE_HISTORY, HANDLE_EXAMPLE_BOT } = process.env;

const roomEventToText = (event) => {
  if (event.type === "m.room.message") {
    return `${event.sender}: ${event.content.body}\n`;
  }
  return "";
}

const client = sdk.createClient({
  baseUrl: homeserver,
  accessToken: access_token,
  userId,
});

const start = async () => {
  await client.startClient();

  let roomText = "";

  client.once(ClientEvent.Sync, async (state, prevState, res) => {
    // state will be 'PREPARED' when the client is ready to use
    console.log(state);

    if (HANDLE_ROOM_PAST_HISTORY == "true") {
      if (state === "PREPARED") {
        handleRoomHistory(roomText);
        roomText = "";
      }
    }
  });

  const scriptStart = Date.now();

  client.on(
    RoomEvent.Timeline,
    async function (event, room, toStartOfTimeline) {
      const eventTime = event.event.origin_server_ts;

      if (event.event.room_id !== whatsAppRoomId) {
        return; // don't activate unless in the active room
      }

      // collect all messages in the room
      if (scriptStart > eventTime) {
        if (HANDLE_ROOM_PAST_HISTORY == "true" && event.getType() === "m.room.message") {
          roomText += `${event.event.sender}: ${event.event.content.body}\n`;
        }
        return; //don't run commands for old messages
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

const doPastHistory = async () => {
  // Experiment with getting room history without subscribing to events
  const roomEventsResponse = await getRoomEvents(whatsAppRoomId);
  const body = await roomEventsResponse.json();
  const { chunk } = (body as any);
  
  console.log("ROOM EVENTS:", chunk)
  let roomText = "";
  chunk.forEach(event => {
    if (event.type === "m.room.message") {
      roomText += `${event.sender}: ${event.content.body}\n`;
    }
  });
  handleRoomHistory(roomText);
}

if(HANDLE_ROOM_PAST_HISTORY == "true"){
  doPastHistory();
} else if (HANDLE_FAKE_HISTORY == "true") {
  let roomText = "";
  roomText += "Tim: Hi, can anyone help me find a good restaurant in the area?\n";
  roomText += "John: I'm not sure about that, but I know a great place for sushi.\n";
  roomText += "Jane: I've heard about this new pizza place that's really good.\n";
  roomText += "Tim: Thanks for the suggestions!\n";
  const fs = require('fs');
  const path = require('path');
  const filePath = path.join(__dirname, '..', 'example_data_sample.txt');
  roomText = fs.readFileSync(filePath, 'utf8')
  handleRoomHistory(roomText);
}else{
  start();
}

