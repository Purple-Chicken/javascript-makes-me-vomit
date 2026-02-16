# Computer Architecture Group Repository
Contributors: Stephen, Hasan, Adam, Ivan, Ellis, Hongzhan

## What is this?

This is were we are going to be keeping our group project for this class, and optionally notes and other stuff to share.

Git is a version control system, 
meaning it keeps track of 
different versions of files over time. 
You can have people work on a different version of a file, or even roll back to a previous change if necessary.

## How is it structured?

TBD

 ## How do I use Git?

### Initial setup
 First, you want to open up your code editor, and set up your path to where you want to be working in the filesystem. Then you can run: 
 ```
 git clone https://github.com/Purple-Chicken/javascript-makes-me-vomit.git
```
to copy this repository to your filesystem. 

### Typical session
When starting your session, it's important to get the latest version of the repo from remote (GitHub). You do this with: 
```
git pull
```
This way, you can get the lastest contributions from your peers and build on their work instead of redoing it.

Now, you can work on your changes. Don't forget to save your progress by saving the file regularly. 

Once you have done something (can be a small commit), you can stage your changes, create a commit, and push to remote by running:
```
git add [path/to/file] ; 
git commit -m "[insert message here]" ; 
git push 
```

If someone else has been working on something at the same time, to check if you are up to date (and not update your local branch), you can run: 
```
git fetch origin main
```
And if you want to take any up-to-date changes that may exist into your current working branch, you can run: 
```
git pull
```

