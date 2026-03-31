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
