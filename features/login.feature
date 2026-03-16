Feature: User can log in with an existing account
  Scenario: Successful login
    Given I am on the landing page
    When I click "Log In"
    Then I should be on the Login page
    When I fill in "Email" with "user.example"
    And I fill in "Password" with "Password"
    And I click "Log In"
    Then I should be redirected to my chat page
    And I should see a new chat
