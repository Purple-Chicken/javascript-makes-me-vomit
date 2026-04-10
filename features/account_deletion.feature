Feature: Delete user account
  As a data-privacy-conscious user, I want to delete my account
  to maintain privacy.

  Scenario: View account deletion confirmation
    Given I am authenticated
    When I go to the account settings page
    And I press the delete account button
    Then I should see a confirmation dialog to delete my account
    And I should see a warning that this action is irreversible

  Scenario: Successfully delete account
    Given I am authenticated
    And I am on the delete account confirmation dialog
    When I choose "Yes"
    And I enter the correct username and password
    Then my account should be permanently deleted
    And I should be logged out

  Scenario: Prevent login after account deletion
    Given my account has been deleted
    When I attempt to log in with my previous credentials
    Then I should not be able to sign in

  Scenario: Incorrect credentials during account deletion
    Given I am authenticated
    And I am on the delete account confirmation dialog
    When I choose "Yes"
    And I enter an incorrect username or password
    Then I should see an error message "Incorrect username or password"
    And my account should not be deleted
