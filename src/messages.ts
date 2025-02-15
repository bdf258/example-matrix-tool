import { v4 as uuidv4 } from "uuid";
import { sendMessage, getEvent } from "./matrixClientRequests";
import { PERSON_NAME, ROLE_NAME, PSEUDO_STATE_EVENT_TYPE } from "./constants";
import { getPseudoState, setPseudoState } from "./pseudoState";
import Anthropic from "@anthropic-ai/sdk";

const { userId, CLAUDE_API_KEY } = process.env;
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

const hello = async (roomId: string) => {
  sendMessage(
    roomId,
    `🤖Example Tool🤖: Hello I'm the matrix example tool. 
    I track who has been assigned roles in this group. 
    React to this message with:\n
    ❤️ to see the current assigned roles\n
    👍 to assign a role to someone`
  );
};

const sendPersonRequest = (roomId: string, replyText: string) => {
  sendMessage(
    roomId,
    `Quote-reply to this message with the name of the role you want to assign to ${replyText}.`,
    {
      person: {
        name: replyText,
      },
      expecting: ROLE_NAME,
    }
  );
};

const assignRole = async (
  personName: string,
  roomId: string,
  replyText: string
) => {
  let roleState = await getPseudoState(roomId, PSEUDO_STATE_EVENT_TYPE);

  if (!roleState) {
    roleState = {
      content: {
        assignedRoles: [],
      },
    };
  }

  const { assignedRoles } = roleState.content;
  assignedRoles.push({
    id: uuidv4(),
    person: {
      name: personName,
    },
    role: {
      name: replyText,
    },
  });

  setPseudoState(roomId, PSEUDO_STATE_EVENT_TYPE, { assignedRoles });

  sendMessage(roomId, `You've assigned ${personName} the role ${replyText}.`);
};

const handleReply = async (event) => {
  const roomId = event.event.room_id;
  const message = event.event.content.body;
  const replyText = message.split("\n\n")[1] || message;
  const prevEventId =
    event.event.content["m.relates_to"]["m.in_reply_to"].event_id;

  const prevEvent = (await getEvent(roomId, prevEventId)) as any;

  if (prevEvent.sender !== userId) return;

  const { expecting } = prevEvent.content.context;

  if (expecting === PERSON_NAME) {
    sendPersonRequest(roomId, replyText);
  }
  if (expecting === ROLE_NAME) {
    const personName = prevEvent.content.context.person.name;
    assignRole(personName, roomId, replyText);
  }
};

export const handleMessage = async (event) => {
  const message = event.event.content.body.toLowerCase();
  const { room_id } = event.event;

  //if message is a reply, handle reply
  if (event.event.content["m.relates_to"]) {
    handleReply(event);
    return;
  }

  //if message has the tool's wake word, say hello
  if (message.includes("example")) {
    hello(room_id);
    return;
  }
};

const client_anthropic = new Anthropic({
  apiKey: CLAUDE_API_KEY!, // This is the default and can be omitted
});


export const handleRoomHistory = async (roomText: string) => {
  try {
    console.log("Processing chat history...");

    const message = await client_anthropic.messages.create({
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Please provide a concise summary of this chat conversation: \n\n${roomText}`
      }],
      model: 'claude-3-5-sonnet-latest',
    });

    // Send the summary back to the Matrix room
    if (message.content) {
      await sendMessage(
        process.env.whatsAppRoomId!,
        `📝 Chat Summary:\n${(message.content[0] as any).text}`
    );
    }

  } catch (error) {
    console.error('Error in handleRoomHistory:', error);
    
    if (error instanceof Anthropic.APIError) {
      console.log('API Error details:', {
        status: error.status,
        name: error.name,
        message: error.message
      });
    }
    
    await sendMessage(
      process.env.whatsAppRoomId!,
      "❌ Sorry, I encountered an error while generating the chat summary."
    );
  }
};