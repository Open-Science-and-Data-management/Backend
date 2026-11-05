// reviews module — read model ของคิวพิจารณา (flow #6)
import { Module } from "@nestjs/common";
import { ReviewsController } from "./reviews.controller.js";
import { ReviewsService } from "./reviews.service.js";
import { ReviewsRepository } from "./reviews.repository.js";

@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewsRepository],
})
export class ReviewsModule {}
