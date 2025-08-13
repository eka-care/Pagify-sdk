// Test setup file
import 'jest-environment-jsdom';

// Mock the dynamic imports
global.mockPagedJS = {
    Previewer: class MockPreviewer {
        async preview() {
            return { total: 1 };
        }
    }
};

global.mockHtml2pdf = {
    default: () => ({
        set: () => ({
            from: () => ({
                toPdf: () => ({
                    get: () => ({
                        then: (fn) => {
                            fn({
                                internal: {
                                    getNumberOfPages: () => 1
                                }
                            });
                            return {
                                outputPdf: () => ({
                                    then: (fn) => {
                                        fn(new Blob(['test'], { type: 'application/pdf' }));
                                        return {
                                            catch: () => {}
                                        };
                                    }
                                })
                            };
                        }
                    })
                })
            })
        })
    })
};

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');

// Mock dynamic imports
jest.mock('pagedjs', () => global.mockPagedJS);
jest.mock('html2pdf.js', () => global.mockHtml2pdf);
