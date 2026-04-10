Feature: User can create a new account
  Scenario: Successful account registration
    Given I am on the landing page
    When I click "Log In"
    And I click "Sign Up"
    Then I should be on the Create Account page
    When I fill in "Username" with "user.example"
    And I fill in "Password" with "Password"
    And I click "Create Account"
    Then I should be on the Login page
    And I click "Log In"
    Then I should be logged in
    And I should be redirected to my chat page
