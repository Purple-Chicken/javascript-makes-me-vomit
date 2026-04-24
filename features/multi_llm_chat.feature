Feature: Multi-LLM chat comparison
  As an authenticated user, I want to run one prompt against multiple models,
  so that I can compare outputs and keep the best answer.

  Background:
    Given I am authenticated for multi-LLM chat
    And the following models are available for comparison:
      | provider | model       |
      | Ollama   | qwen2.5:3b  |
      | Ollama   | mistral:7b  |
      | Ollama   | llama3.1:8b |

  Scenario: Compare responses from selected models in one send
    When I select the following active models:
      | model       |
      | qwen2.5:3b  |
      | mistral:7b  |
    And I send the prompt "Explain TCP handshake briefly"
    Then the prompt should be sent to all selected models
    Then I should see one response for each selected model
    And each response should include provider and model labels

  Scenario: Enable and disable models without leaving chat
    When I select the following active models:
      | model       |
      | qwen2.5:3b  |
      | mistral:7b  |
    And I disable model "mistral:7b" from the active selection
    And I send the prompt "Name one sorting algorithm"
    Then disabled model "mistral:7b" should not receive the next prompt

  Scenario: Save and reuse a default model set
    When I set my default model set to:
      | model       |
      | qwen2.5:3b  |
      | llama3.1:8b |
    And I start a new chat session
    Then the active model selection should match my default model set

  Scenario: Partial failure keeps successful model outputs
    Given model "mistral:7b" is currently unavailable
    When I select the following active models:
      | model      |
      | qwen2.5:3b |
      | mistral:7b |
    And I send the prompt "Summarize binary search"
    Then I should see a non-blocking error for model "mistral:7b"
    And I should still see a successful response for model "qwen2.5:3b"

  Scenario: History stores model metadata per assistant response
    When I select the following active models:
      | model       |
      | qwen2.5:3b  |
      | llama3.1:8b |
    And I send the prompt "Give me two title ideas"
    Then the saved conversation history should include provider and model metadata per assistant response

  Scenario: Multi-LLM routes require authentication
    Given I am unauthenticated for multi-LLM chat
    When I attempt to open the multi-LLM chat page
    Then I should be redirected to login before accessing multi-LLM controls

  Scenario: Stream responses independently per selected model
    When I select the following active models:
      | model       |
      | qwen2.5:3b  |
      | llama3.1:8b |
    And I enable streaming for active models
    And I send the prompt "Stream this response"
    Then I should receive streaming updates independently per active model

  Scenario: Single model selection remains backward compatible
    When I select only model "qwen2.5:3b"
    And I send the prompt "What is recursion?"
    Then chat should behave as single-model mode
    And I should see one assistant response in standard chat layout


