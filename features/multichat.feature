Feature: Parallel Multi-Agent Chat
  As a user, I want to query multiple models at once
  So that I can compare their output side-by-side.

  Background:
    Given I am logged into the application
    And the "Local LLM" and "ChatGPT" models are active

  Scenario: Sending one prompt to two agents simultaneously
    When I enter "Compare Python and Ruby" into the chat input
    And I click the "Send" button
    Then I should see a response container for "Local LLM"
    And I should see a separate response container for "ChatGPT"
