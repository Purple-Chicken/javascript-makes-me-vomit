Feature: Delete Account 
  Scenario: Unsucessful deletion for unauthenticated user 
    Given I am not authenticated as the correct user 
    When I select "Delete Account" 
    Then I am returned an error 
    And the user is not deleted 
  Scenario: Unsucessful deletion for authenticated user 
    Given I am an authenticated user 
    When I select "Delete Account" 
    And I enter incorrect credentials 
    Then I am returned an error 
    And the user is not deleted 
  Scenario: Successful deletion for authenticated user 
    Given I am an authenticated user 
    When I select "Delete Account" 
    And I enter correct confirmation credentials 
    Then I am signed out of the user to be deleted 
    And the user' chat history is deleted 
    And the user is deleted 
