Feature: Real-time Message Streaming
  Scenario: User sees incremental response
    Given I am an authenticated user 
    And I have sent a prompt to the LLM
    When the server begins streaming the response chunks
    Then I should see the message text appearing character-by-character
    And I should see a "typing" or "processing" indicator until the stream ends
