Feature: Delete Chat 
  Scenario: Unsuccessful deletion for unauthenticated user
    Given I am not an authenticated user 
    When I request to delete a chat 
    Then I am returned an error 
    And the chat is not deleted 
  Scenario: Unsuccessful deletion for incorrect user 
    Given I am an authenticated user 
    When I request to delete a chat 
    And the chat is owned by a different user 
    Then I am returned an error 
    And the chat is not deleted 
  Scenario: Successful deletion for correct authenticated user 
    Given I am an authenticated user 
    When I request to delete a chat 
    And the chat is owned by my current user 
    Then I should see a visual change 
    And the full chat history is deleted
