import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import CardOne from "./views/CardOne.vue";
import CardThree from "./views/CardThree.vue";
import CardTwo from "./views/CardTwo.vue";
import NotFound from "./views/NotFound.vue";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "one",
    component: CardOne,
    meta: { title: "01 Signal · Test Card" },
  },
  {
    path: "/grid",
    name: "two",
    component: CardTwo,
    meta: { title: "02 Grid · Test Card" },
  },
  {
    path: "/notes",
    name: "three",
    component: CardThree,
    meta: { title: "03 Notes · Test Card" },
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: NotFound,
    meta: { title: "Lost · Test Card" },
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.afterEach((to) => {
  document.title = typeof to.meta.title === "string" ? to.meta.title : "Test Card";
});
