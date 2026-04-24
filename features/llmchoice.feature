Feature: LLM Selection and Management
  As a user, I want to manage a list of local and cloud-based LLMs
  So that I can route my prompts to the most appropriate provider.

  Background:
    Given I am logged into the application
    And the backend has local models "qwen3:8b" and "llama3" available

  Scenario: Loading the model dropdown from the backend (Fetching & Caching)
    When I click on the "Model Selector" dropdown
    Then the application should fetch available models from "/api/models"
    And I should see "qwen3:8b" and "llama3" in the dropdown list
    When I close and re-click the "Model Selector" dropdown
    Then the application should NOT fetch from "/api/models" again (cached)

  Scenario: Selecting and using a Local LLM
    Given the model dropdown is open
    When I click on "qwen3:8b"
    And I send the message "What is your local version?"
    Then the request sent to "/api/chat" should include the model "qwen3:8b"
    And the response should be displayed in the chat window

  Scenario: Importing and selecting a Cloud LLM
    Given I open the "Add Cloud Model" modal
    When I select provider "Anthropic"
    And I enter model name "claude-3-5-sonnet"
    And I click "Import Model"
    Then "claude-3-5-sonnet" should appear in the "Model Selector" dropdown
    When I select "claude-3-5-sonnet" from the dropdown
    And I send the message "Hello Claude"
    Then the system should route the request through our API with provider "anthropic"
