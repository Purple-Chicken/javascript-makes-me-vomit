Feature: User can access settings
  Scenario: Navigate to settings page when logged in
    Given I am logged in
    When I navigate to the settings page
    Then I should see the settings page
    And I should see "Switches and knobs to make your experience at home."

  Scenario: Access settings from navigation
    Given I am logged in
    When I click "Settings"
    Then I should be redirected to the settings page
    And I should see settings options