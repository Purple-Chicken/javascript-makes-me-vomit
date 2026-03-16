Feature: User login is remembered via cookies
  Scenario: Returning user is auto-authenticated
    Given I have previously logged in
    And my session cookie is still valid
    When I navigate to the home page
    Then I should be automatically logged in
    And I should be redirected to my dashboard
    And I should not see the "Log In" prompt
