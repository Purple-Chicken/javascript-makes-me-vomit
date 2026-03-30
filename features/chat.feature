Feature: User can access and use the chat functionality
  Scenario: Navigate to chat page when logged in
    Given I am logged in
    When I navigate to the chat page
    Then I should see the chat interface
    And I should see "Welcome to the chat page!"

  Scenario: Access chat from navigation
    Given I am logged in
    When I click "Chat"
    Then I should be redirected to my chat page
    And I should see a new chat