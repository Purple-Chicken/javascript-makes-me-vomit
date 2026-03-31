Feature: Chat Expiration Logic
  Scenario: Attempting to access an expired chat via direct URL
    Given a persistent chat was set to expire at "12:00 PM"
    And the current time is "12:01 PM"
    When I attempt to navigate to that chat's specific URL
    Then I should see a "404 - Conversation Expired" message
    And the chat should be removed from my sidebar list
