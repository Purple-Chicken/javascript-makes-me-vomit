# Page Routing

As of now, our application is an **SPA**, or **S**ingle **P**age **A**pplication. This lets us dynamically change the content without having to reload the entire page. 

## Current Implemented Routes

The current routes registered in `src/router.ts` and backed by files in `src/routes/` are:

- `#/` -> `src/routes/home.ts`
- `#/login` -> `src/routes/login.ts`
- `#/signup` -> `src/routes/signup.ts`
- `#/chat` -> `src/routes/chat.ts`
- `#/account` -> `src/routes/account.ts`
- `#/settings` -> `src/routes/settings.ts`
- `#/history` -> `src/routes/history.ts`

These are the route names that should be used in feature/design docs (including `docs/multi-llm-chat-report.tex`) unless new routes are added to `src/router.ts`.

## How to Use 

To add a new page, simply add your page into `src/routes/[your-page].ts`, import the file into `src/router.ts`: 
```
import [your-module-name] from './routes/[your-page].ts
...
```
And add it into the modules in `src/router.ts`: 
```
...
const modules = {
  '/': homeModule,
  ...
  '/[your-domain]': [your-module-name], 
  ...
};
...

```

Subpages and sidebars still have to be figured out, however it shouldn't differ much from this. 

## Resources 

I used the following blog post to set up routing for our application. I was looking for ways to implement routing in vanilla JS/TS (vanilla as in no frameworks), and stumbled upon this gem. It caught my eye especially since he also is using Vite and Docker for dev and deployment. I will def recommend everybody to at least skim through the blog. 

- [Julien Reichel Blog](https://medium.com/@julienreichel/building-a-vanilla-js-router-with-vite-243e06b26cbd) 
- [Example Repo](https://github.com/julienreichel/vanilla-js-router/tree/main) 
