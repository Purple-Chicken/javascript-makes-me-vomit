Feature: Client-side routing
  Scenario: Visiting the keyboard route shows the keyboard listener page
    Given the app is loaded
    When I navigate to "/keyboard"
    Then I should see "Keyboard Listener"
