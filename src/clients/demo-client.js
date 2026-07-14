export const demoClient = {
  mount({ container, session }) {
    const main = document.createElement("main");
    main.className = "demo-client";

    const title = document.createElement("h1");
    title.textContent = "Protected demo";

    const email = document.createElement("p");
    email.textContent = session.user.email;

    main.append(title, email);
    container.replaceChildren(main);
  },

  unmount() {}
};

