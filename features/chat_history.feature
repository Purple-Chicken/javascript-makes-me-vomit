Feature: Chat History Sidebar
  Scenario: Authenticated user views their conversation list
    Given I am logged in
    And I have 3 existing persistent conversations
    And I have 1 temporary conversation
    When I open the "History" sidebar
    Then I should see exactly 3 conversation entries
    And each entry should display the chat title and the model used (e.g., "GPT-4")
    And the temporary conversation should not be in the list
  Scenario: Expired chats are removed from history
    Given I have a chat that has reached its expiration time
    When I refresh my conversation list
    Then the expired chat should no longer appear in the sidebar
  Scenario: Switching between conversations
    Given I am viewing "Chat A"
    When I select "Chat B" from the history sidebar
    Then the URL should update to include the ID for "Chat B"
    And the message window should clear and load the history for "Chat B"
    And the input area should still be locked to the model assigned to "Chat B"

  Scenario: Resuming a branched conversation
    Given I have a chat with multiple branches
    When I select that chat from my history
    Then the UI should load the "primary" or most recent branch by default
    And I should see an indicator that other branches exist
