import { Given, When, Then } from '@cucumber/cucumber';

When('I enter incorrect credentials', () => {
  // Mock entering a wrong password
  globalThis.lastError = "Invalid Credentials";
});

When('I enter correct confirmation credentials', () => {
  globalThis.lastError = null;
});

Then('I am returned an error', () => {
  if (!globalThis.lastError) throw new Error("Expected an error message but none found");
});

Then('the user is not deleted', () => {
  // Logic to verify user still exists in your mock DB
});

Then('the user is deleted', () => {
  authState.loggedIn = false;
  // Logic to verify user was removed
});
