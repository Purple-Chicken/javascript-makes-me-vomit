# Software Engineering Group Repository
Contributors: Stephen, Hasan, Adam, Ivan, Ellis, Hongzhan

## What is this?

This is were we are going to be keeping our group project for this class, and optionally notes and other stuff to share.

Git is a version control system, 
meaning it keeps track of 
different versions of files over time. 
You can have people work on a different version of a file, or even roll back to a previous change if necessary.

## How is it structured?

- `src`: Source directory for our project 
    - `src/css`: Our CSS files go here 
    - `src/routes`: Routing info (update page without <C-r> refresh)
    - `src/models`: Mongoose data models (User, Conversation)
    - `src/config`: Passport authentication configuration
- `backend/`: Docker Compose setup for MongoDB and Ollama
- `static/`: where we put images 
- `tests/`: Our Cucumber and Jasmine testing files go here
- `features/`: Cucumber BDD feature files and step definitions
- `server.ts`: Express API server — REST endpoints, Ollama chat proxy, auth
- `package.json`: Packages needed to run the program 
- `tsconfig.json`: Configuration of TS in our project 
- `.env` , `.env.example`: Environment variables for the database, JWT secret, and Ollama settings

## How do I contribute? 

First, make sure you have the project dependencies installed: `python3`, `git`, `npm`, `docker`, `node`. 

Second, make sure you have the repo locally: 
 ```
 git clone https://github.com/Purple-Chicken/javascript-makes-me-vomit.git 
```

Once you `cd` into the repository, you would need to make the following changes: 
- Copy `.env.example` into `.env`, making changes as needed 
- Start `ollama` and database using 
```docker compose -f backend/docker-compose.yaml up -d```
- Pull the Ollama model (first time only — this downloads ~2.6 GB):
```docker exec ollama ollama pull qwen3:8b```
  You can verify it's ready with: `docker exec ollama ollama list`
- run `npm i` to install/update all the node modules
- run `npm run dev` to run the development (testing) environment 

> **Ollama configuration:** The chat feature calls the Ollama container at `http://127.0.0.1:11435` using the `qwen3:0.6b` model by default. You can change these in your `.env` file with `OLLAMA_URL` and `OLLAMA_MODEL`.

Alternatively, you can run this handy dandy one-liner that does it all for you: 
```
 git clone https://github.com/Purple-Chicken/javascript-makes-me-vomit.git && cd javascript-makes-me-vomit && cp .env.example .env && docker compose -f backend/docker-compose.yaml up -d && docker exec ollama ollama pull qwen3:8b && npm i && npm run dev
```


 ## How do I use Git?


### Typical session
When starting your session, it's important to create a new branch for a feature. You make a new branch by running: 
```
git branch -b [new-branch-name]
```
This way, you don't push directly to main and put potentially risky code in production. 

If you want to work on an existing branch, you can run: 
```
git checkout [existing-branch-name]
```

Once you have done something (can be a small commit), you can stage your changesand create a commit by running:
```
git add [path/to/file(s)] ; 
git commit -m "[insert message here]" ; 
```
After you have a few commits, you can sync to remote.

You can monitor your progress with `git status`. It tells you what branch you are working on, how many commits you are ahead/behind, 

If you have created a new branch 
```
git push --set-upstream origin [new-branch-name]
```
And, assuming you are are not on main, you can push onto your branch. 

In GitHub, you can make a pull request if you want to merge to main. 
