Feature: Client-side routing
  Scenario: Visiting the home route shows the home page
    Given the app is loaded
    When I navigate to "/"
    Then I should see "Home"

  Scenario: Visiting an unknown route shows the 404 page
    Given the app is loaded
    When I navigate to "/does-not-exist"
    Then I should see "404"
    Then I should see "Not Found"
