Feature: User can log out
  Scenario: Successful logout
    Given I am logged in
    And I am on my dashboard
    When I press "Log Out"
    Then I should be redirected to the landing page
    And I should no longer be authenticated
