Feature: Markdown and Emoji Rendering
  Scenario: User sends LLM a plaintext prompt
    Given I am logged in 
    And I have a previous conversation
    When I submit an unformatted prompt 
    Then the message should display 
  Scenario: User sends LLM a prompt with Markdown headers
    Given I am logged in 
    And I have a previous conversation
    When I submit a prompt with MD style header
    Then the message should display the headers in a larger font
  Scenario: User sends LLM a prompt with Markdown bullets or lists
    Given I am logged in 
    And I have a previous conversation
    When I submit a prompt with MD style lists (using - or 1.)
    Then my message should display bullet points and lists in a markdown format
  Scenario: User sends LLM a prompt with Markdown links
    Given I am logged in 
    And I have a previous conversation
    When I submit a prompt with MD style links
    Then my message should contain a visually distinct link 
    And the link should have the specified text 
    And the link should go to the specified URL
  Scenario: User sends LLm a prompt with Markdown style codeblocks
    Given I am logged in 
    And I have a previous conversation
    When I submit a prompt with MD style codeblock (using ``` ```) or verbatim lines (using ` `)
    Then the message should be displayed with a visually distinct code block section 
    And the code block font should be monospace 
  Scenario: LLM sends user a plaintext response
    Given I am logged in 
    And I have a previous conversation
    When the LLM generates a response with MD style links
    Then the message should display
  Scenario: LLM sends the user a response with Markdown headers 
    Given I am logged in 
    And I have a previous conversation
    When the LLM generates a response with MD style header 
    Then the message should display the headers in a larger font
  Scenario: LLM sends the user a prompt with Markdown bullets or lists
    Given I am logged in 
    And I have a previous conversation
    When the LLM generates a response with MD style lists (using - or 1.)
    Then the message should display bullet points and lists in a markdown format
  Scenario: LLM sends the user a prompt with Markdown links
    Given I am logged in 
    And I have a previous conversation
    When the LLM generates a response with MD style links
    Then the message should contain a visually distinct link 
    And the link should have the specified text 
    And the link should go to the specified USL
  Scenario: LLM sends the user a response with Markdown style codeblocks 
    Given I am logged in 
    And I have a previous conversation
    When the LLM submits a response with MD style codeblock (using ``` ```) or verbatim lines (using ` `)
    Then the message should be displayed with a visually distinct code block section 
    And the code block font should be monospace

