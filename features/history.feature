Feature: User can view chat history
  Scenario: Navigate to history page when logged in
    Given I am logged in
    When I navigate to the history page
    Then I should see the chat history page
    And I should see "Here are your previous chats."

  Scenario: Access history from navigation
    Given I am logged in
    When I click "History"
    Then I should be redirected to the history page
    And I should see my chat history