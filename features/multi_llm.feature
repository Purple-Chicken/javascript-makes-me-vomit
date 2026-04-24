Feature: Multi-LLM Chat
  As a user, I want to enable multi-LLM chat to get responses from three different LLMs simultaneously,
  so I can compare their outputs.

  Scenario: Enable Multi-LLM Setting
    Given I am authenticated
    When I navigate to settings
    And I enable multi-LLM chat
    And I select three LLM models
    And I save the settings
    Then the settings should be saved successfully

  Scenario: Chat with Multi-LLM Enabled
    Given I am authenticated
    And multi-LLM is enabled with three models
    When I send a message in chat
    Then I should receive responses from three LLMs tagged as [LLM1], [LLM2], [LLM3]