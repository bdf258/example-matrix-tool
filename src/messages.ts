import { v4 as uuidv4 } from "uuid";
import { sendMessage, getEvent } from "./matrixClientRequests";
import { PERSON_NAME, ROLE_NAME, PSEUDO_STATE_EVENT_TYPE } from "./constants";
import { getPseudoState, setPseudoState } from "./pseudoState";
import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
const { SEND_TO_CONSOLE, SEND_TO_MATRIX, SEND_TO_GIT, SKIP_CLAUDE } = process.env;

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

const CLAUDE_SUMMARY_PROMPT = `You will analyze a set of WhatsApp chat messages and create a high-level summary of the most important discussion threads from the past month. Judge importance by:
1. Number of messages in the thread
2. Number of different participants engaging
3. Duration of the conversation thread
4. Whether resources/links were shared
5. Whether any personally sensitive information was shared, in which case you will NOT include this in the summary.

For each important thread, include:
- The timestamp of the first message in that thread
- A 15-25 word description capturing the core topic and any key debates/outcomes
- Any relevant links shared, as indented sub-bullets

Order the threads by engagement level (most engaged first). Include only the 4-8 most significant threads. If there are no significant threads, please include 5 summaries.

Format each thread as:
* [DD/MM/YYYY, HH:MM] Thread description
  * Link 1
  * Link 2

Format the links in markdown with a title and the url.

Keep descriptions concise but informative, capturing:
- The main topic/question
- Key points of disagreement (if applicable) 
- Any resolution or outcome
- Any action items or next steps

Please format the output as a bullet point list with sub-bullets for links.
If there are no significant threads, just return "No significant threads found" and nothing else.`;

export const handleRoomHistory = async (roomText: string) => {
  try {
    console.log("Processing chat history...");

    let message;
    if (SKIP_CLAUDE == "true") {
      message = {
        content: [{
          text: "Claude is disabled, set SKIP_CLAUDE=false to get summaries."
        }]
      }
    }else{
       message = await client_anthropic.messages.create({
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `${CLAUDE_SUMMARY_PROMPT}\n\n${roomText}`
        }],
        model: 'claude-3-5-sonnet-latest',
      });
    }

    // Send the summary back to the Matrix room
    if (message.content) {
      const messageText = (message.content[0] as any).text;
      if (SEND_TO_CONSOLE == "true") {
        console.log(`📝 Chat Summary:\n${messageText}`);
      }
      if (SEND_TO_MATRIX == "true") {
        await sendMessage(
          process.env.whatsAppRoomId!,
          `📝 Chat Summary:\n${(message.content[0] as any).text}`
        );
      }
      if (SEND_TO_GIT == "true") {
        const fs = require('fs');
        const path = require('path');

        // Create a new file with the current date and time
        const date = new Date();
        const formattedDate = date.toISOString().split('T')[0];

        const summaryDir = path.join(__dirname, '..', 'summaries');

        console.log("Pulling latest summaries...");
        execSync('git pull', {cwd: summaryDir});

        const fileName = formattedDate + ".md";
        const filePath = path.join(summaryDir, fileName);

        // Write the new file
        if (fs.existsSync(filePath)) {
          console.log("Summaries already exist for this date, deleting it...");
          execSync('git rm ' + filePath, {cwd: summaryDir});
        }
        fs.writeFileSync(filePath, messageText);
        console.log(`Chat Summary saved to ${filePath}`);

        // Update SUMMARY.md
        const summaryFile = path.join(summaryDir, 'SUMMARY.md');
        let summaryContent = fs.readFileSync(summaryFile, 'utf8');
        
        // Ensure content ends with newline
        if (!summaryContent.endsWith('\n')) {
          summaryContent += '\n';
        }
        
        const newSummaryLine = `* [${formattedDate}](${fileName})\n`;
        
        if (!summaryContent.includes(newSummaryLine)) {
          summaryContent += newSummaryLine;
          fs.writeFileSync(summaryFile, summaryContent);
          console.log(`Updated summary ${summaryFile}`);
        } else {
          console.log(`Summary already contains entry for ${formattedDate}`);
        }

        // Update git
        console.log("Adding and committing summaries...");
        execSync('git add ' + filePath, {cwd: summaryDir});
        execSync('git commit -am "Add chat summary for ' + formattedDate + '"', {cwd: summaryDir});
        console.log("Pushing summaries to remote...");
        execSync('git push', {cwd: summaryDir});
        
      }
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