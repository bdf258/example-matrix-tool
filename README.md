# Matrix Chat Summarizer

This app summarizes chat logs from a file or matrix room, then writes the summaries as a matrix message or as a file in a git repo (to be used with gitbooks).

## Getting started

1. Clone the repo or fork the REPL
1. Copy the `.env.example` file and rename `.env`
1. Register on Matrix ([app.element.io](https://app.element.io) is a popular way)
1. Copy your user id, homeserver and access token from Element into the `.env` file. Here is a screenshot: ![element user id](https://raw.githubusercontent.com/King-Mob/example-matrix-tool/refs/heads/main/element_user_id.png) ![element homserver and access token](https://raw.githubusercontent.com/King-Mob/example-matrix-tool/refs/heads/main/element_homeserver_access_token.png)
1. Set whatsAppRoomId [sic] to the Matrix room id to read/write to.
1. Also set the CLAUDE_API_KEY environment variable to your Anthropic API key.
1. Change other `.env` settings to control what the app does.
1. Run the command `npm install`
1. Run the command `npm run dev`