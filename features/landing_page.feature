Feature: User views the landing page
  Scenario: Visit the home page
    Given I am not logged in
    When I navigate to the home page
    Then I should see the landing page
    And I should see options to "Log In"
