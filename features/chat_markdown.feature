Feature: Markdown and Emoji Rendering
  Scenario Outline: Markdown elements render correctly in chat bubbles
    Given I am in a conversation with an LLM
    When the <sender> sends a message with <markdown_type>
    Then the message should be rendered with the correct <html_element>
    And it should have the <visual_style>

    Examples:
      | sender    | markdown_type      | html_element | visual_style   |
      | user      | "### Header"       | "h3"         | "large font"   |
      | assistant | "- Item 1"         | "li"         | "bullet point" |
      | assistant | "```js code ```"   | "pre"        | "monospace"    |
  Scenario: LLM response contains a formatted data table
    Given I am logged in
    And I have an active conversation 
    When the LLM generates a response with a GFM table:
      """
      | Model | Speed | Accuracy |
      |-------|-------|----------|
      | GPT-4 | Fast  | High     |
      | Pro   | Med   | Med      |
      """
    Then the message should be displayed with a "table" element
    And the table should have 1 "thead" row and 2 "tbody" rows
    And the first header cell should contain "Model"
    And the last body cell should contain "Med"
  Scenario: LLM response contains a functional hyperlink
    Given I am logged in 
    And I have an active conversation
    When the LLM generates a response with "[Google](https://google.com)" 
    Then the message should contain a visually distinct link
    And the link text should be "Google"
    And the link "href" attribute should be "https://google.com" 
    And the link should open in a new browser tab
