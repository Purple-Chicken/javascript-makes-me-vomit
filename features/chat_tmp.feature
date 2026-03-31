Feature: Temporary Chats 
  Scenario: Authenticated user changes mode to temporary chat 
    Given I am an authenticated user 
    When I select "temporary chat" 
    Then an icon changes indicating the new chat will be a temporary chat 
  Scenario: Authenticated user starts a temporary chat 
    Given I am an authenticated user 
    And I have selected "temporary chat" 
    When I type a string 
    And press "Enter" 
    Then my message should be sent 
    And I should receive a response 
    And the chat should be a temporary chat 
  Scenario: Authenticated user returns to a temporary chat in the same session 
    Given I am an authenticated user 
    And I have a temporary chat in my current session 
    When I navigate to a different chat 
    And I navigate back to the temporary chat 
    Then the temporary chat history should be preserved 
  Scenario: Authenticated user returns to a temporary chat in a different session 
    Given I am an authenticated user 
    And I have a temporary chat in my current session 
    When I sign out / log off my current session 
    And I login to a new session under the same user 
    Then the temporary chat should not be visible
    And the temporary chat is not stored on the server 

