import { Controller, Get, Inject, OnModuleInit, Param } from '@nestjs/common';
import {
  ClientGrpc,
  GrpcMethod,
  GrpcStreamMethod,
} from '@nestjs/microservices';
import { Observable, ReplaySubject, Subject } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { HeroById } from './interfaces/hero-by-id.interface';
import { Hero } from './interfaces/hero.interface';

interface HeroesService {
  findOne(data: HeroById): Observable<Hero>;
  findMany(upstream: Observable<HeroById>): Observable<Hero>;
}

/**
 * Controller for managing heroes.
 *
 * @class
 * @name HeroController
 */
@Controller('hero')
export class HeroController implements OnModuleInit {
  private readonly items: Hero[] = [
    { id: 1, name: 'John' },
    { id: 2, name: 'Doe' },
  ];
  private heroesService: HeroesService;

  constructor(@Inject('HERO_PACKAGE') private readonly client: ClientGrpc) {}

  /**
 * Initializes the HeroController module.
 * Retrieves the HeroesService from the client and assigns it to the heroesService property.
 */
  onModuleInit() {
    this.heroesService = this.client.getService<HeroesService>('HeroesService');
  }

  /**
 * Retrieves multiple heroes.
 * 
 * @returns An Observable that emits an array of Hero objects.
 */
  @Get()
  getMany(): Observable<Hero[]> {
    const ids$ = new ReplaySubject<HeroById>();
    ids$.next({ id: 1 });
    ids$.next({ id: 2 });
    ids$.complete();

    const stream = this.heroesService.findMany(ids$.asObservable());
    return stream.pipe(toArray());
  }

  /**
 * Retrieves a hero by ID.
 * 
 * @param id The ID of the hero to retrieve.
 * @returns An Observable that emits the Hero object with the specified ID.
 */
  @Get(':id')
  getById(@Param('id') id: string): Observable<Hero> {
    return this.heroesService.findOne({ id: +id });
  }

  /**
 * Retrieves a hero by ID.
 * 
 * @param data The HeroById object containing the ID of the hero to retrieve.
 * @returns The Hero object with the specified ID.
 */
  @GrpcMethod('HeroesService')
  findOne(data: HeroById): Hero {
    return this.items.find(({ id }) => id === data.id);
  }

  /**
 * Retrieves multiple heroes.
 * 
 * @param data$ An Observable that emits HeroById objects.
 * @returns An Observable that emits Hero objects.
 */
  @GrpcStreamMethod('HeroesService')
  findMany(data$: Observable<HeroById>): Observable<Hero> {
    const hero$ = new Subject<Hero>();

    const onNext = (heroById: HeroById) => {
      const item = this.items.find(({ id }) => id === heroById.id);
      hero$.next(item);
    };
    const onComplete = () => hero$.complete();
    data$.subscribe({
      next: onNext,
      complete: onComplete,
    });

    return hero$.asObservable();
  }
}
