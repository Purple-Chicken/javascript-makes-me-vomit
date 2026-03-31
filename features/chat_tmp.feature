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
  Scenario: Temporary chat is destroyed upon navigation
    Given I am in an active "Temporary Chat" session
    And I have received 2 messages from the LLM
    When I navigate to a different chat or page
    And I navigate back to the "New Chat" page
    Then the previous temporary messages should be gone
    And the chat interface should be reset to empty
  Scenario: Temporary chat is destroyed upon page refresh
    Given I am in an active "Temporary Chat" session
    When I refresh the browser tab
    Then the app should load the default "New Chat" state
    And no trace of the temporary session should remain in memory
