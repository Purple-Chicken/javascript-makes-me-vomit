Feature: Chat is shown by default after login
  As a returning user, I want to see the chat immediately upon logging in,
  so I don't need to navigate menus.

  Scenario: Chat by Default
    Given that I have an account
    When I log in to my account
    Then I should see the chat screen

  Scenario: Conversations
    Given I am authenticated
    And I am on the chat screen
    When I type something into the chat box
    Then I should get a response from the LLM
