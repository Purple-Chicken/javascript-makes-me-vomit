Feature: User can manage their account
  Scenario: Navigate to account page when logged in
    Given I am logged in
    When I navigate to the account page
    Then I should see the account settings page
    And I should see a password change form
    And I should see a delete account button

  Scenario: Access account from navigation
    Given I am logged in
    When I click "Account"
    Then I should be redirected to the account page
    And I should see my account management options

  Scenario: Attempt to change password
    Given I am on the account page
    When I fill in "Old Password" with "oldpassword"
    And I fill in "New Password" with "newpassword"
    And I fill in "Confirm Password" with "newpassword"
    And I click "Update Password"
    Then I should see a success message or error message

  Scenario: Attempt to delete account
    Given I am on the account page
    When I click "Delete My Account"
    Then I should see a confirmation prompt or be redirected