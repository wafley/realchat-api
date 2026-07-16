# RealChat API

RealChat API is the backend service for a real-time chat application built with Express.js, TypeScript, PostgreSQL, Drizzle ORM, and Socket.IO. It provides REST API and WebSocket communication for authentication, user management, private chat, group chat, and other real-time features.

## Tech Stack

- Node.js
- Express.js
- TypeScript
- PostgreSQL
- Drizzle ORM
- Socket.IO

## Requirements

- Node.js >= 22
- PostgreSQL >= 16
- npm >= 10

## Installation

```bash
npm install
```

## Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Then update the values inside `.env`.

## Database

Generate the schema and run migrations:

```bash
npm run db:generate
npm run db:migrate
```

(Optional) Seed the database with sample data:

```bash
npm run seed
```

## Development

```bash
npm run dev
```

## Project Structure

```
realchat-api/
├── scripts/
├── src/
│   ├── config/
│   ├── db/
│   ├── middlewares/
│   ├── modules/
│   ├── routes/
│   ├── socket/
│   └── utils/
├── uploads/
├── package.json
└── README.md
```

## Planned Features

- Authentication (JWT)
- User Profile
- Private Chat
- Group Chat
- Typing Indicator
- Online Presence
- Notifications
- Search
- File Upload

## Status

🚧 Under Development
