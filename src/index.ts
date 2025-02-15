import "dotenv/config";
import * as sdk from "matrix-js-sdk";
import { RoomEvent, ClientEvent } from "matrix-js-sdk";
import { handleMessage, handleRoomHistory } from "./messages";
import handleReaction from "./reactions";
const { homeserver, access_token, userId, whatsAppRoomId, HANDLE_ROOM_RECENT_HISTORY, HANDLE_ROOM_PAST_HISTORY, HANDLE_FAKE_HISTORY, HANDLE_EXAMPLE_BOT } = process.env;

const client = sdk.createClient({
  baseUrl: homeserver,
  accessToken: access_token,
  userId,
});

const start = async () => {
  await client.startClient();

  // Experiment with getting room history without events
  if(HANDLE_ROOM_RECENT_HISTORY){
    const room = client.getRoom(whatsAppRoomId);
    
    if (room) {
        const timeline = room.getLiveTimeline();

        console.log("TIMELINE:", timeline);

        client.paginateEventTimeline(timeline, { backwards: true, limit: 10 })
            .then((moreMessages) => {
                if (moreMessages) {
                    const events = timeline.getEvents();
                    events.forEach(event => {
                        if (event.getType() === "m.room.message") {
                            console.log(`Message: ${event.getContent().body}`);
                        }
                    });
                }
            })
            .catch((err) => console.error("Failed to fetch history:", err));
      }
      await client.stopClient();
      return;
  }

  let roomText = "";

  client.once(ClientEvent.Sync, async (state, prevState, res) => {
    // state will be 'PREPARED' when the client is ready to use
    console.log(state);

    if (HANDLE_ROOM_PAST_HISTORY) {
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
        if (HANDLE_ROOM_PAST_HISTORY && event.getType() === "m.room.message") {
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

if (HANDLE_FAKE_HISTORY) {
  let roomText = "";
  roomText += "Tim: Hi, can anyone help me find a good restaurant in the area?\n";
  roomText += "John: I'm not sure about that, but I know a great place for sushi.\n";
  roomText += "Jane: I've heard about this new pizza place that's really good.\n";
  roomText += "Tim: Thanks for the suggestions!\n";
  handleRoomHistory(roomText);
}else{
  start();
}

