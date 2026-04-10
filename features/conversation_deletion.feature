Feature: Delete individual conversations
  As a data-privacy-conscious user, I want to delete my conversations
  to maintain privacy.

  Scenario: View single conversation deletion
    Given I am authenticated
    And I have a previous conversation
    When I select a previous chat
    And navigate through chat options
    And select Delete Chat
    Then I should see a pop-up confirming to delete this chat
    And I should see options to delete or not delete the conversation

  Scenario: Prevent conversation deletion
    Given I am authenticated
    And I have a previous conversation
    And I am on the conversation deletion dialog
    When I choose "No"
    Then the dialog should disappear
    And the conversation should still be there

  Scenario: Successfully Delete Single Conversation
    Given I am authenticated
    And I have a previous conversation
    And I am on the conversation deletion dialog
    When I choose "Yes"
    Then the dialog should disappear
    And I should be redirected to a new chat
    And the conversation I was in before should be deleted

  Scenario: Cancel Delete Conversation
    Given I am authenticated
    And I have a previous conversation
    When I select a previous chat
    And navigate through chat options
    And select Delete Chat
    Then I should see a pop-up confirming to delete this chat
    When I choose "Yes"
    Then the chat should disappear
