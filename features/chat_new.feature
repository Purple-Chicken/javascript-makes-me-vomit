Feature: Create new chats 
  Scenario: Authenticated user creates first chat 
    Given I am an authenticated user 
    And I have no previous chats 
    When I type a string 
    And press "Enter" 
    Then a new chat is created 
    And the message is displayed 
    And the message is sent to the server 
    And a new chat session is created 
    And the server returns the LLM response 
  Scenario: Authenticated user creates new chat from a different page
    Given I am an authenticated user 
    And I am currently not on the 'new chat' page 
    When I select "new chat" 
    Then I am redirected to the "new chat" page 
    And I am able to create a new chat 
  Scenario: User authenticates and creates a new chat 
    Given I am an unauthenticated user
    And I have an account
    When I sign in to my account 
    Then I should be redirected to the "new chat" version of the chat page
  Scenario: New chat is added to history immediately
    Given I am an authenticated user
    When I start a new non-temporary chat
    Then the chat should immediately appear at the top of my history sidebar
    And it should be marked as the "active" conversation
  Scenario: User sets an expiration period for a persistent chat
    Given I am creating a new persistent chat
    When I set the expiration to "24 hours"
    And I send my first message
    Then the chat is saved to the database with a deletion timestamp
