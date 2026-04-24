import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';

export interface CustomWorld extends World {
  token?: string;
  selectedModels: string[];
  lastApiResponse?: any;
  baseUrl: string;
}

class MyWorld extends World implements CustomWorld {
  token = undefined;
  selectedModels = [];
  lastApiResponse = undefined;
  baseUrl = 'http://127.0.0.1:5000';

  constructor(options: IWorldOptions) {
    super(options);
    // No window/document mocks here anymore!
  }
}

setWorldConstructor(MyWorld);
