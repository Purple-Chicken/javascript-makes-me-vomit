Feature: Choose one LLM response from ask all
  As an authenticated user
  I want to ask all local models the same prompt in one chat
  So that I can pick which model reply becomes the saved assistant response

  Scenario: Ask all models and save one response to the chat log
    Given I am on the chat page with ask all available
    When I submit the prompt "Compare two answers" with Ask all
    Then I should see candidate replies from "qwen3.5:2b" and "llama3.2:1b"
    When I choose the response from "llama3.2:1b"
    Then the chat log should save the response from "llama3.2:1b"