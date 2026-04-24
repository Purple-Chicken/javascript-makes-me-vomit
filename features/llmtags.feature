Feature: LLM Tags
  As a system, I want to tag messages with their respective Model IDs
  So that models don't get confused by responses from other agents.

  Scenario: Message isolation via hidden tags
    Given the chat contains a message from "Agent-A"
    And the chat contains a message from "Agent-B"
    When I inspect the message from "Agent-A"
    Then it should have a data attribute "data-agent-id" set to "Agent-A"
    And the tag identifier should not be visible to the user's eye

  Scenario: Contextual continuity
    When I ask "Agent-A" a follow-up question
    Then the request payload should only include history tagged for "Agent-A"
