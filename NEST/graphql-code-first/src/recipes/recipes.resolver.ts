import { NotFoundException } from '@nestjs/common';
import { Args, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { PubSub } from 'graphql-subscriptions';
import { NewRecipeInput } from './dto/new-recipe.input';
import { RecipesArgs } from './dto/recipes.args';
import { Recipe } from './models/recipe.model';
import { RecipesService } from './recipes.service';

const pubSub = new PubSub();

/**
 * Resolver for Recipe queries and mutations.
 */
@Resolver(of => Recipe)
export class RecipesResolver {
  constructor(private readonly recipesService: RecipesService) {}

  /**
 * Retrieves a recipe by its ID.
 * 
 * @param id - The ID of the recipe to retrieve.
 * @returns A Promise that resolves to the retrieved recipe.
 * @throws NotFoundException if the recipe with the specified ID does not exist.
 */
  @Query(returns => Recipe)
  async recipe(@Args('id') id: string): Promise<Recipe> {
    const recipe = await this.recipesService.findOneById(id);
    if (!recipe) {
      throw new NotFoundException(id);
    }
    return recipe;
  }

  /**
 * Retrieves a list of recipes based on the provided arguments.
 * 
 * @param recipesArgs - The arguments for filtering and pagination.
 * @returns A Promise that resolves to an array of recipes.
 */
  @Query(returns => [Recipe])
  recipes(@Args() recipesArgs: RecipesArgs): Promise<Recipe[]> {
    return this.recipesService.findAll(recipesArgs);
  }

  /**
 * Adds a new recipe.
 * 
 * @param newRecipeData - The data for the new recipe.
 * @returns A Promise that resolves to the newly created recipe.
 */
  @Mutation(returns => Recipe)
  async addRecipe(
    @Args('newRecipeData') newRecipeData: NewRecipeInput,
  ): Promise<Recipe> {
    const recipe = await this.recipesService.create(newRecipeData);
    pubSub.publish('recipeAdded', { recipeAdded: recipe });
    return recipe;
  }

  /**
 * Removes a recipe by its ID.
 * 
 * @param id - The ID of the recipe to remove.
 * @returns A Promise that resolves to a boolean indicating whether the recipe was successfully removed.
 */
  @Mutation(returns => Boolean)
  async removeRecipe(@Args('id') id: string) {
    return this.recipesService.remove(id);
  }

  /**
 * Subscribes to the 'recipeAdded' event and returns an async iterator.
 * 
 * @returns An async iterator that emits the newly added recipes.
 */
  @Subscription(returns => Recipe)
  recipeAdded() {
    return pubSub.asyncIterator('recipeAdded');
  }
}
