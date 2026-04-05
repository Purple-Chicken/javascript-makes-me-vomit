Feature: View and search previous conversations
  As a user with many conversations, I want to view and search my previous
  conversations, so that I can continue them.

  Scenario: Save Conversation History
    Given I am authenticated
    And I have previous conversations
    When I select a previous conversation
    Then I should be able to view that previous conversation

  Scenario: Continue Previous Conversations
    Given I am authenticated
    And I have previous conversations
    And I am on a previous chat screen
    When I send a new chat message
    Then I should get a response from the LLM
    And the response should hold the previous chat's context

  Scenario: Search Previous Conversations
    Given I am authenticated
    And I have previous conversations
    When I press the search button
    And type a search string
    Then I should see a list of conversations containing that string
    And it should be sorted with the most recent first
