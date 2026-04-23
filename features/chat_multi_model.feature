Feature: Compare multiple LLM responses
  As an authenticated user
  I want to submit one prompt to multiple models at once
  So that I can compare their answers in the same chat view

  Scenario: Two selected models return separate replies
    Given I am on the chat page with multiple available models
    When I submit the prompt "Compare two answers" to the selected chat models
    Then I should see separate chat replies from "qwen3:8b" and "mistral:7b"